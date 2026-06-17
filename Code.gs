/**
 * Google Apps Script Backend for POS system.
 * Copy and paste these function implementations into your Apps Script editor.
 */

function addCustomerRaw(sheet, shopName, address, phone, latitude, longitude, debt) {
  // Writes ID, Shop Name, Address, Phone, Latitude, Longitude, Debt
  // Column E is index 4 (Latitude), Column F is index 5 (Longitude)
  var nextId = sheet.getLastRow();
  sheet.appendRow([
    nextId,
    shopName,
    address,
    phone,
    parseFloat(latitude) || 0,
    parseFloat(longitude) || 0,
    debt || 0
  ]);
}

function updateCustomerRaw(sheet, oldShopName, shopName, address, phone, latitude, longitude) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === oldShopName) {
      sheet.getRange(i + 1, 2).setValue(shopName); // Column B: Shop Name
      sheet.getRange(i + 1, 3).setValue(address);  // Column C: Address
      sheet.getRange(i + 1, 4).setValue(phone);    // Column D: Phone
      sheet.getRange(i + 1, 5).setValue(parseFloat(latitude) || 0); // Column E (index 4): Latitude
      sheet.getRange(i + 1, 6).setValue(parseFloat(longitude) || 0);// Column F (index 5): Longitude
      break;
    }
  }
}

// Example of how your doGet should parse the sheet data for the "customers" fetch:
function getCustomersData(sheet) {
  var data = sheet.getDataRange().getValues();
  var customers = [];
  for (var i = 1; i < data.length; i++) {
    customers.push({
      "اسم المحل": data[i][1],
      "العنوان": data[i][2],
      "رقم الهاتف": data[i][3],
      "Latitude": data[i][4],  // Column E (index 4)
      "Longitude": data[i][5], // Column F (index 5)
      "الديون": data[i][6]
    });
  }
  return customers;
}
