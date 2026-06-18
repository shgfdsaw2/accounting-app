/**
 * Google Apps Script Backend for POS system.
 * Separated into products profiles ("المنتجات") and stock ("المخزون").
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var customersSheet = ss.getSheetByName("العملاء");
  
  var data = {
    products: getProductsData(ss),
    customers: getCustomersData(customersSheet)
  };
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var postData = JSON.parse(e.postData.contents);
  
  // Token verification
  if (postData.token !== "POS_AUTH_KEY_2026") {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var action = postData.action;
  var customersSheet = ss.getSheetByName("العملاء");
  
  if (action === "addCustomer") {
    addCustomerRaw(customersSheet, postData);
  } else if (action === "updateCustomer") {
    var values = customersSheet.getDataRange().getValues();
    updateCustomerRaw(customersSheet, postData.oldShopName, postData, values);
  } else if (action === "addProduct") {
    addProductRaw(ss, postData);
  } else if (action === "updateProduct") {
    updateProductRaw(ss, postData.oldName, postData);
  } else if (action === "deleteProduct") {
    deleteProductRaw(ss, postData.name);
  } else if (action === "addSale") {
    addSaleRaw(ss, postData);
  } else if (action === "addPurchase") {
    addPurchaseRaw(ss, postData);
  } else if (action === "addReturn") {
    addReturnRaw(ss, postData);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function addCustomerRaw(sheet, data) {
  // Writes: Shop Name (Col A), Address (Col B), Phone (Col C), Debt (Col D), Latitude (Col E), Longitude (Col F)
  sheet.appendRow([
    data.shopName,
    data.address || "",
    String(data.phone || ""),
    parseFloat(data.debt) || 0,
    data.latitude || "",
    data.longitude || ""
  ]);
}

function updateCustomerRaw(sheet, oldShopName, data, values) {
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === oldShopName) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        data.shopName,
        data.address || "",
        String(data.phone || ""),
        data.debt !== undefined ? parseFloat(data.debt) : parseFloat(values[i][3]),
        data.latitude || "",
        data.longitude || ""
      ]]);
      break;
    }
  }
}

function getCustomersData(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var customers = [];
  for (var i = 1; i < data.length; i++) {
    customers.push({
      "اسم المحل": data[i][0], // Column A: Shop Name
      "العنوان": data[i][1],  // Column B: Address
      "رقم الهاتف": data[i][2], // Column C: Phone
      "الديون": parseFloat(data[i][3]) || 0, // Column D: Debt
      "Latitude": parseFloat(data[i][4]) || 0,  // Column E: Latitude
      "Longitude": parseFloat(data[i][5]) || 0 // Column F: Longitude
    });
  }
  return customers;
}

function getProductsData(ss) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return [];
  
  var prodData = prodSheet.getDataRange().getValues();
  var stockData = stockSheet.getDataRange().getValues();
  
  var stockMap = {};
  for (var i = 1; i < stockData.length; i++) {
    var name = stockData[i][0];
    if (name) {
      stockMap[name] = parseFloat(stockData[i][1]) || 0;
    }
  }
  
  var products = [];
  for (var j = 1; j < prodData.length; j++) {
    var name = prodData[j][0];
    if (name) {
      var barcode = prodData[j][1] || "";
      var buyPrice = parseFloat(prodData[j][2]) || 0;
      var sellPrice = parseFloat(prodData[j][3]) || 0;
      var wholesalePrice = parseFloat(prodData[j][4]) || 0;
      var category = prodData[j][5] || "";
      var quantity = stockMap[name] !== undefined ? stockMap[name] : 0;
      
      products.push({
        name: name,
        barcode: barcode,
        buyPrice: buyPrice,
        price: sellPrice,
        wholesalePrice: buyPrice !== 0 ? buyPrice : wholesalePrice,
        category: category,
        quantity: quantity
      });
    }
  }
  return products;
}

function addProductRaw(ss, data) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  // Name, Barcode, Buy Price, Sell Price, Wholesale Price, Category
  prodSheet.appendRow([
    data.name,
    data.barcode || "",
    parseFloat(data.buyPrice) || 0,
    parseFloat(data.sellPrice) || 0,
    parseFloat(data.wholesalePrice) || 0,
    data.category || ""
  ]);
  
  // Name, Quantity
  stockSheet.appendRow([
    data.name,
    parseFloat(data.quantity) || 0
  ]);
}

function updateProductRaw(ss, oldName, data) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  // Update specs in "المنتجات"
  var prodValues = prodSheet.getDataRange().getValues();
  for (var i = 1; i < prodValues.length; i++) {
    if (prodValues[i][0] === oldName) {
      prodSheet.getRange(i + 1, 1, 1, 6).setValues([[
        data.name,
        data.barcode || "",
        parseFloat(data.buyPrice) || 0,
        parseFloat(data.sellPrice) || 0,
        parseFloat(data.wholesalePrice) || 0,
        data.category || ""
      ]]);
      break;
    }
  }
  
  // Update quantity and name in "المخزون"
  var stockValues = stockSheet.getDataRange().getValues();
  var nameFoundInStock = false;
  for (var j = 1; j < stockValues.length; j++) {
    if (stockValues[j][0] === oldName) {
      stockSheet.getRange(j + 1, 1, 1, 2).setValues([[
        data.name,
        parseFloat(data.quantity) || 0
      ]]);
      nameFoundInStock = true;
      break;
    }
  }
  if (!nameFoundInStock) {
    stockSheet.appendRow([
      data.name,
      parseFloat(data.quantity) || 0
    ]);
  }
}

function deleteProductRaw(ss, name) {
  var prodSheet = ss.getSheetByName("المنتجات");
  var stockSheet = ss.getSheetByName("المخزون");
  if (!prodSheet || !stockSheet) return;
  
  var prodValues = prodSheet.getDataRange().getValues();
  for (var i = 1; i < prodValues.length; i++) {
    if (prodValues[i][0] === name) {
      prodSheet.deleteRow(i + 1);
      break;
    }
  }
  
  var stockValues = stockSheet.getDataRange().getValues();
  for (var j = 1; j < stockValues.length; j++) {
    if (stockValues[j][0] === name) {
      stockSheet.deleteRow(j + 1);
      break;
    }
  }
}

function addSaleRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty - (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}

function addPurchaseRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty + (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}

function addReturnRaw(ss, data) {
  var stockSheet = ss.getSheetByName("المخزون");
  if (!stockSheet) return;
  var values = stockSheet.getDataRange().getValues();
  
  data.items.forEach(function(item) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === item.name) {
        var currentQty = parseFloat(values[i][1]) || 0;
        var newQty = currentQty + (parseFloat(item.qty) || 0);
        stockSheet.getRange(i + 1, 2).setValue(newQty);
        values[i][1] = newQty;
        break;
      }
    }
  });
}
