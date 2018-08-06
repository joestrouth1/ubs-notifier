require('dotenv').config()
const fs = require('fs')
const async = require('async')
const mime = require('mime')
const uuid = require('uuid/v1')
const notifier = require('mail-notifier')

const imap = {
  user: process.env.EMAIL_USERNAME,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT, // imap port
  tls: true, // use secure connection
  tlsOptions: {
    rejectUnauthorized: false
  },
  directory: 'attachments'
};

const n = notifier(imap)
n.on('end', () => n.start())
  .on('mail', (mail) => {
    const {
      from,
      subject
    } = mail
    console.log({
      from,
      subject
    })
    console.log(`Has attachments? ${!!mail.attachments}`)
    if (mail.attachments) {
      async.each(mail.attachments, (attachment, callback) => {
        var filePath = (imap.directory || "/tmp") + '/' + attachment.fileName;
        fs.writeFile(filePath, attachment.content, function (err) {
          if (err) {
            console.error(`error writing attachment at ${filePath}`, err)
          } else {
            console.info(`File saved at ${filePath}`)
          }
        })
      })
    }
  })
  .on('error', (err) => console.dir(err, {
    depth: null
  }))
  .start()
