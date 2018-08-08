//@ts-check

const fs = require('fs')
const csv = require('csvtojson')

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

const filePath = 'attachments/primary.csv'
async function readCsv(path) {
  const jsonArray = await converter.fromFile(path)
  return jsonArray
}

/**
 * @description Reduces a JSON array of purchase order objects by finding duplicate POs and combining their items arrays 
 * @param {array} acc Accumulated POs after processing (should be empty to start)
 * @param {object} next Next PO in the array 
 */
const orderReducer = (acc, next) => {
  const matchingPo = acc.find(e => e.poNumber === next.poNumber)

  if (matchingPo) {
    matchingPo.items = [...matchingPo.items, ...next.items]
    return acc
  } else {
    return [...acc, next]
  }
}

readCsv(filePath)
  .then(json => {
    return json.reduce(orderReducer, [])
  })
  .then(orders => console.dir(orders, {
    depth: null
  }))
