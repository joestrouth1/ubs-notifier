//@ts-check
require('dotenv').config()
const fs = require('fs')
const async = require('async')
const mime = require('mime')
const uuidv1 = require('uuid/v1')
const csv = require('csvtojson')
const notifier = require('mail-notifier')

/**
 * @desc Config for imap mail-notifier client
 * @prop {string} directory - Path to where attached files will be saved. CSVs in root, json in './json' 
 */
const imap = {
  user: process.env.EMAIL_USERNAME,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT, // imap port
  tls: true, // use secure connection
  tlsOptions: {
    rejectUnauthorized: false
  },
  directory: process.env.ATTACHMENT_DIRECTORY
};

/**
 * @description CSV->JSON constructor
 * @prop {array} Headers - Property names to replace CSVs current headers. Supports nested output.
 */
const converter = csv({
  headers: [
    'poNumber',
    'items.0.quantity',
    'items.0.model',
    'items.0.description',
    'shipTo.name',
    'shipTo.company',
    'shipTo.address1',
    'shipTo.address2',
    'shipTo.city',
    'shipTo.stateCode',
    'shipTo.zipCode',
    'shipTo.shippingMethodCode',
    'items.0.cost',
    'orderDate',
    'shipTo.phone',
  ]
})


const n = notifier(imap)
//@ts-ignore
n.on('end', () => n.start())
  .on('mail', (mail) => {
    const {
      from,
      subject,
      attachments
    } = mail
    console.info('Mail Received:', {
      from,
      subject,
      hasAttachments: !!attachments
    })

    if (attachments) {

      async.each(attachments, (attachment, callback) => {
        const filePath = (imap.directory || "/tmp") + '/' + attachment.fileName;
        const fileExtension = mime.getExtension(attachment.contentType)

        // If attachment is CSV, save to root attachments folder
        if (fileExtension === 'csv') {
          const uniqueId = uuidv1();
          const uniqueFilePath = filePath.replace(/csv/, `${uniqueId}.csv`)
          fs.writeFile(uniqueFilePath, attachment.content, function (err) {
            if (err) {
              console.error(`error writing CSV to ${uniqueFilePath}`, err)
            } else {
              console.log(`CSV saved at ${uniqueFilePath}`)
              // Convert CSV to JSON, reduce orders, and save output to 'json' subfolder
              readCsv(uniqueFilePath)
                .then(json => json.reduce(orderReducer, []))
                .then(orders => {
                  const jsonFileName = attachment.fileName.replace(/csv/, `${uniqueId}.json`)
                  const jsonPath = (imap.directory || "/tmp") + '/json/' + jsonFileName;
                  fs.writeFile(jsonPath, JSON.stringify(orders), (err) => {
                    if (err) return console.error(err);
                    return console.log(`JSON orders saved at ${jsonPath}`)
                  })
                })

              /** @todo Update Celigo integration to pull from json directory */
              /** @todo Verify no overlap with the folders/depth that the SD integration is watching */

            }
          })
        } else {
          // if attachment is not CSV, save to 'invalid' subfolder
          console.warn(`Not a CSV file: ${attachment.fileName}`)
          /* 
           * Removed saving of non-csv files, as they aren't needed on disk.
           * Mainly due to tiny logos and links in email signatures and such.
           * No telling what other attachments, of what size/type may get saved.
           */
          /* const invalidPath = `${imap.directory}/invalid/${attachment.fileName}`
          fs.writeFile(invalidPath, attachment.content, (err) => {
            if (err) {
              console.error(`error writing attachment at ${invalidPath}`, err)
            } else {
              console.log(`File saved at ${invalidPath}`)
            }
          }) */
        }
      })
    } else {
      console.warn(`Mail did not have any attachments, not touching it.`)
    }
  })
  .on('error', (err) => console.error(err, {
    depth: null
  }))
  .start()


/**
 * @summary Reads CSV from disk to formatted JSON
 * @param {string} path CSV location on disk
 * @returns {Promise<Array>} Collection of purchase order objects
 */
async function readCsv(path) {
  const jsonArray = await converter.fromFile(path)
  return jsonArray
}

/**
 * @description Reduces a JSON array of purchase order objects by finding duplicate POs and combining their items arrays 
 * @param {Array} acc Accumulated POs after processing (should be empty to start)
 * @param {Object} next Next PO in the array
 * @returns {Array} List of consolidated POs (may or may not be complete)
 */
function orderReducer(acc, next) {
  const matchingPo = acc.find(e => e.poNumber === next.poNumber)

  if (matchingPo) {
    matchingPo.items = [...matchingPo.items, ...next.items]
    return acc
  } else {
    return [...acc, next]
  }
}
