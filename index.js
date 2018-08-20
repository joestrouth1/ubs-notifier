//@ts-check
require('dotenv').config()
const fs = require('fs')
const each = require('async/each')
const mime = require('mime')
const uuidv1 = require('uuid/v1')
const csv = require('csvtojson')
const leftPad = require('left-pad')
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
      each(attachments, attachment => {
        const filePath = (imap.directory || "/tmp") + '/' + attachment.fileName;
        const fileExtension = mime.getExtension(attachment.contentType)

        // If attachment is CSV, save to root attachments folder
        if (fileExtension === 'csv') {
          /**
           * Create CSV to JSON converter
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
          const uniqueId = uuidv1();
          console.dir(attachment.content.toString('utf8'), {
            depth: 3
          })
          const uniqueFilePath = filePath.replace(/csv$/, `${uniqueId}.csv`)
          fs.writeFile(uniqueFilePath, attachment.content, async function (err) {
            if (err) {
              console.error(`error writing CSV to ${uniqueFilePath}`)
            } else {
              console.log(`CSV saved at ${uniqueFilePath}`)
              // Convert CSV to JSON, reduce orders, and save output to 'json' subfolder
              /**
               * DO NOT read file content from newly saved CSV. Causes read/write stream errors on subsequent order emails.
               * DO read attachment content from parsed email.
               * DO convert attachment content from buffer to string. 
               * GIVEN that attachment.content is a buffer and not a stream, seems that lib is using nodemailer's simpleParser class,
               * rather than MailParser.
               */
              const jsonArray = await converter.fromString(attachment.content.toString('utf8'))
              const combinedOrders = jsonArray.reduce(orderReducer, [])
              const jsonFileName = attachment.fileName.replace(/csv/, `${uniqueId}.json`)
              const jsonPath = (imap.directory || "/tmp") + '/json/' + jsonFileName;
              fs.writeFile(jsonPath, JSON.stringify(combinedOrders), (err) => {
                if (err) {
                  console.error('error writing json to disk');
                }
                return console.log(`JSON orders saved at ${jsonPath}`)
              })

              /* 
                            readCsv(uniqueFilePath)
                              .then(json => json.reduce(orderReducer, []), (e) => console.error(`error reducing JSON:`, e))
                              .then(orders => {
                                const jsonFileName = attachment.fileName.replace(/csv/, `${uniqueId}.json`)
                                const jsonPath = (imap.directory || "/tmp") + '/json/' + jsonFileName;
                                fs.writeFile(jsonPath, JSON.stringify(orders), (err) => {
                                  if (err) return console.error(err);
                                  return console.log(`JSON orders saved at ${jsonPath}`)
                                })
                              }, (e) => console.error('error saving json', e)) */

              /** @todo Verify no overlap with the folders/depth that the SD integration is watching */

            }
          })
        } else {
          // Failed CSV file extension check
          console.warn(`Not a CSV file: ${attachment.fileName}`)
        }
      }, (err) => err && console.error(err))
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
async function readCsv(path, converter) {
  const jsonArray = await converter.fromFile(path)
  const combinedOrders = jsonArray.reduce(orderReducer, [])
  return combinedOrders
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
    // ensure that ZIP is 5 digits in case CSV trimmed leading zeroes
    next.shipTo.zipCode = leftPad(next.shipTo.zipCode, 5, 0)
    return [...acc, next]
  }
}
