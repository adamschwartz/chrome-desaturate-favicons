const data = {}

const generateDataURLs = url => {
  if (data.desaturated)
    return data.desaturated

  const image = new Image()
  image.crossOrigin = 'Anonymous'

  image.onload = function() {
    var canvas = document.createElement('canvas')

    canvas.width = image.width
    canvas.height = image.height

    var context = canvas.getContext('2d')

    context.drawImage(image, 0, 0)

    data.original = canvas.toDataURL()

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

    data.desaturated = canvas.toDataURL()
  }

  image.src = url
}

const faviconURL = pageURL => {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageURL)
  url.searchParams.set('size', '32')
  return url.toString()
}

generateDataURLs(faviconURL(window.location.href))

const getFaviconLinkEls = () => Array.from(document.querySelectorAll('link[rel~=icon]'))

const setFavicon = dataURL => {
  if (!dataURL) return

  let linkEls = getFaviconLinkEls()

  if (!linkEls.length) {
    const linkEl = document.createElement('link')
    linkEl.setAttribute('rel', 'icon')
    document.head.appendChild(linkEl)
  }

  getFaviconLinkEls().reverse().forEach(link => {
    if (!data.backup) data.backup = link.href

    link.href = dataURL
  })
}

addEventListener('blur', () => {
  setFavicon(data.desaturated)
})

addEventListener('focus', () => {
  let url = data.original
  if (url === data.desaturated && data.backup) url = data.backup
  setFavicon(url)
})
