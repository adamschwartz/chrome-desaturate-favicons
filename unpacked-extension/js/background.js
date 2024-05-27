var favIconUrlPerTabId = {}

var desaturatedFavIconCache = {}
var saturatedFavIconCache = {}

chrome.runtime.onInstalled.addListener(function(details){
  updateTabs()
})

chrome.tabs.onActivated.addListener(function(activeInfo) {
  updateTabs()
})

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (!changeInfo.favIconUrl) {
    return
  }

  // We've seen this tab before and its favIcon is the desaturated one we created
  if (favIconUrlPerTabId[tabId] && desaturatedFavIconCache[changeInfo.favIconUrl]) {
    return
  }

  // Chrome sets the favIcon to this default sometimes when it shouldn't
  if (changeInfo.favIconUrl === 'https://www.google.com/favicon.ico' && (!tab.url || !tab.url.match(/.*\.google\./))) {
    return
  }

  chrome.tabs.executeScript(tab.id, {
    code: '' +
      // Ensure a `link[rel~=icon]` exists in the head
      'if (!document.querySelector("link[rel~=icon]")) {' +
        'document.head.insertAdjacentHTML(\'beforeend\', \'<link rel="icon">\')' +
      '}' +

      // Save the original favIconUrl in the tab in case the extension is restarted and loses its cache
      // But don't save it if it's a data URL because it may be us from before if the extension needs to restart
      (changeInfo.favIconUrl.substr(0, 5) === 'data:' ? '' :
      'document.querySelector("link[rel~=icon]").setAttribute("data-saturated-original", "' + changeInfo.favIconUrl + '")') +
    ''
  }, function(result){})

  // Don't ever save the original icon if it's a data URL
  if (changeInfo.favIconUrl.substr(0, 5) === 'data:') {
    return
  }

  favIconUrlPerTabId[tabId] = changeInfo.favIconUrl

  updateTabs()
})

var updateTabs = function() {
  chrome.tabs.query({
    active: false
  }, function(tabArray){
    tabArray.forEach(function(tab) {
      desaturateTabFavIcon(tab)
    })
  })

  chrome.tabs.query({
    active: true
  }, function(tabArray){
    if (tabArray.length === 1) {
      saturateTabFavIcon(tabArray[0])
    }
  })
}

var setTabFavIconByURL = function(tab, url) {
  chrome.tabs.executeScript(tab.id, {
    code: '' +
      'if (document.querySelector("link[rel~=icon]")) {' +
        // If there are more than one, apply to all of them
        'Array.prototype.slice.call(document.querySelectorAll("link[rel~=icon]")).forEach(function(l){ l.href = "' + url + '" })' +
      '}' +
    ''
  }, function(result){})
}

var isLegitFavIconURL = function(favIconUrl) {
  if (!favIconUrl) {
    return false
  }

  var chromeProtocol = 'chrome://'
  if (favIconUrl.substr(0, chromeProtocol.length) === chromeProtocol) {
    return false
  }

  return true
}

var saturateTabFavIcon = function(tab) {
  if (!isLegitFavIconURL(tab.favIconUrl)) {
    return
  }

  getSaturatedDataURL(tab, function(url){
    setTabFavIconByURL(tab, url)
  })
}

var desaturateTabFavIcon = function(tab) {
  if (!isLegitFavIconURL(tab.favIconUrl)) {
    return
  }

  getDesaturatedDataURL(tab.favIconUrl, function(url){
    setTabFavIconByURL(tab, url)
  })
}

var getSaturatedDataURL = function(tab, callback) {
  if (saturatedFavIconCache[tab.favIconUrl]) {
    callback(saturatedFavIconCache[tab.favIconUrl])
    return
  }

  // Pull the original favIconUrl out the tab if the extension is restarted and loses its cache
  chrome.tabs.executeScript(tab.id, {
    code: '' +
      'if (document.querySelector("link[data-saturated-original]")) {' +
        'document.querySelector("link[data-saturated-original]").getAttribute("data-saturated-original")' +
      '} else { "" }' +
    ''
  }, function(resultsArray) {
    if (resultsArray && resultsArray.length) {
      callback(resultsArray[0])
      return
    }

    if (saturatedFavIconCache[tab.favIconUrl]) {
      callback(saturatedFavIconCache[tab.favIconUrl])
      return
    }

    callback(tab.favIconUrl)
  })
}

var getDesaturatedDataURL = function(url, callback) {
  if (desaturatedFavIconCache[url]) {
    callback(desaturatedFavIconCache[url])
    return
  }

  var image = new Image()
  image.crossOrigin = "Anonymous"

  image.onload = function() {
    var canvas = document.createElement('canvas')

    canvas.width = image.width
    canvas.height = image.height

    var context = canvas.getContext('2d')

    context.drawImage(image, 0, 0)

    var imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    var px = imageData.data
    var length = px.length
    var i = 0
    var grey

    for (; i < length; i += 4) {
      grey = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11
      px[i] = px[i + 1] = px[i + 2] = grey
    }

    context.putImageData(imageData, 0, 0)

    var dataURL = canvas.toDataURL()

    desaturatedFavIconCache[url] = dataURL
    desaturatedFavIconCache[dataURL] = dataURL

    // If these are the same, something bad has happened and we could accidentally save the desaturated version here instead
    if (url !== dataURL) {
      saturatedFavIconCache[url] = url
      saturatedFavIconCache[dataURL] = url
    }

    callback(dataURL)
  }

  image.src = url
}
