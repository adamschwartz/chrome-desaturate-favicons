var activeTabId;
var favIconUrlPerTabId = {};

var desaturatedFavIconCache = {};
var saturatedFavIconCache = {};

chrome.tabs.onActivated.addListener(function(activeInfo){
    activeTabId = activeInfo.tabId;
    updateTabs();
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (!changeInfo.favIconUrl || favIconUrlPerTabId[tabId] === changeInfo.favIconUrl) {
        return;
    }

    // We've seen this tab before and its favIcon is the desaturated one we created
    if (favIconUrlPerTabId[tabId] && desaturatedFavIconCache[changeInfo.favIconUrl]) {
        return;
    }

    // Chrome sets the favIcon to this default sometimes when it shouldn't
    if (changeInfo.favIconUrl === 'https://www.google.com/favicon.ico') {
        return;
    }

    // Don't ever save the original icon if it's a data URL
    if (changeInfo.favIconUrl.substr(0, 5) === 'data:') {
        return;
    }

    favIconUrlPerTabId[tabId] = changeInfo.favIconUrl;

    // Save the original favIconUrl in the tab in case the extension gets restarted
    chrome.tabs.executeScript(tab.id, {
        code: '' +
            'if (!document.querySelector("link[rel~=icon]")) {' +
                'document.head.insertAdjacentHTML(\'beforeend\', \'<link rel="icon" href="' + changeInfo.favIconUrl + '">\');' +
            '}' +
            'document.querySelector("link[rel~=icon]").setAttribute("data-saturated-original", "' + changeInfo.favIconUrl + '")' +
        ''
    }, function(result){});

    updateTabs();
});

var updateTabs = function() {
    chrome.tabs.query({
        active: false
    }, function(tabArray){
        tabArray.forEach(function(tab){
            desaturateTabFavIcon(tab);
        });
    });

    chrome.tabs.get(activeTabId, function(tab){
        saturateTabFavIcon(tab);
    });
};

var setTabFavIconByURL = function(tab, url) {
    chrome.tabs.executeScript(tab.id, {
        code: '' +
            'if (document.querySelector("link[rel~=icon]")) {' +
                'document.querySelector("link[rel~=icon]").href = "' + url + '";' +
            '}' +
        ''
    }, function(result){});
};

var isLegitFavIconURL = function(favIconUrl) {
    if (!favIconUrl) {
        return false;
    }

    var chromeProtocol = 'chrome://';
    if (favIconUrl.substr(0, chromeProtocol.length) === chromeProtocol) {
        return false;
    }

    return true;
};

var saturateTabFavIcon = function(tab) {
    if (!isLegitFavIconURL(tab.favIconUrl)) {
        return;
    }

    getSaturatedDataURL(tab, function(url){
        setTabFavIconByURL(tab, url);
    });
};

var desaturateTabFavIcon = function(tab) {
    if (!isLegitFavIconURL(tab.favIconUrl)) {
        return;
    }

    getDesaturatedDataURL(tab.favIconUrl, function(url){
        setTabFavIconByURL(tab, url);
    });
};

var getSaturatedDataURL = function(tab, callback) {
    if (favIconUrlPerTabId[tab.id]) {
        callback(favIconUrlPerTabId[tab.id]);
        return;
    }

    if (saturatedFavIconCache[tab.favIconUrl]) {
        callback(saturatedFavIconCache[tab.favIconUrl]);
        return;
    }

    chrome.tabs.executeScript(tab.id, {
        code: 'document.querySelector("link[rel~=icon]").getAttribute("data-saturated-original")'
    }, function(resultsArray) {
        if (resultsArray && resultsArray.length) {
            favIconUrlPerTabId[tabId] = resultsArray[0];
            callback(resultsArray[0]);
            return;
        }

        if (favIconUrlPerTabId[tab.id]) {
            callback(favIconUrlPerTabId[tab.id]);
            return;
        }

        if (saturatedFavIconCache[tab.favIconUrl]) {
            callback(saturatedFavIconCache[tab.favIconUrl]);
            return;
        }

        callback(tab.favIconUrl);
    });
};

var getDesaturatedDataURL = function(url, callback) {
    if (desaturatedFavIconCache[url]) {
        callback(desaturatedFavIconCache[url]);
        return;
    }

    var image = new Image();

    image.onload = function(){
        var canvas = document.createElement('canvas');

        canvas.width = image.width;
        canvas.height = image.height;

        var context = canvas.getContext('2d');

        context.drawImage(image, 0, 0);

        var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        var px = imageData.data;
        var length = px.length;
        var i = 0;
        var grey;

        for (; i < length; i += 4) {
            grey = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
            px[i] = px[i + 1] = px[i + 2] = grey;
        }

        context.putImageData(imageData, 0, 0);

        var dataURL = canvas.toDataURL();

        desaturatedFavIconCache[url] = dataURL;
        desaturatedFavIconCache[dataURL] = dataURL;

        saturatedFavIconCache[url] = url;
        saturatedFavIconCache[dataURL] = url;

        callback(dataURL);
    };

    image.src = url;
};