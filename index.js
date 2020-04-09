const mongoose = require('mongoose')
const request = require('request-promise')
const cheerio = require('cheerio')
const _ = require('lodash')

const Company = require('./models/Company')

const URL = 'https://timkiem.vnexpress.net/?search_f=title,tag_list&q=Covid-19&media_type=all&fromdate=0&todate=0&latest=&cate_code=kinhdoanh&date_format=all&'
const companyCount = 1000
const pageSize = 26 
const pageCount = parseInt(companyCount / pageSize)
 
/**
 * Get content for each page
 * 
 * @param {*} uri (Ex: ${URL}page/2)
 */
const getPageContent = (uri) => {
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    transform: (body) => {
      return cheerio.load(body)
    }
  }

  return request(options)
    .then(($) => {
      return {
        $,
        uri,
      }
    })
}

/**
 * Parse html to company Object
 * 
 * #list-companies
 *  .tile
 *    .tile-icon img src (logo link)
 *    .tile-content
 *      .tile-title [0] => Company Name & Review Link
 *        a href (review link)
 *          text (company name)
 *      .tile-title [1] => Info (Location, type, size, country, working time)
 *        icon
 *        text (Info - Repeat 5 times)
 *      .tile-title [2] => Reviews (count, avg)
 *        a>span text => count
 *        >span
 *          i*5 (i | i.none)
 * 
 * @param {*} $ 
 */
const html2Company = ($) => {
  // logo
  const name = $.find('a').attr('title')
  const link = $.find('a').attr('href')
  const category = 'Kinh doanh'
  const content = $.find('a').text()
  console.log('clear ==>', name)

  return {
    name,
    link,
    category,
    content
  }
}

/**
 * Parse html to companies
 * 
 * @param {*} $ 
 */
const html2Companies = ($) => {
  const companies = []
  $('#result_search .description').each((_, c) => {
    companies.push(html2Company($(c)))
  })
  return companies
}

const createCompanies = (companies) => {
  return Promise.all(companies.map(c => Company.findOneAndUpdate({ name: c.name }, { $set: c }, { upsert: true })))
}

const crawlPage = (uri) => {
  let isError = false
  return getPageContent(uri)
    .then(({ uri, $ }) => {
      return html2Companies($)
    }).catch(error => {
      isError = true
    }).then((companies) => {
      return isError ? uri : companies
    })
}

const crawl = async(pages, results) => {
  const chunks = await Promise.all(pages.map(uri => crawlPage(uri)))
  const availableChunks = _.filter(chunks, c => typeof c === 'object')
  const remainPages = _.filter(chunks, c => typeof c === 'string')
  if (availableChunks.length > 0) {
    results = await Promise.all(availableChunks.map(companies => createCompanies(companies)))
      .then((data) => data.reduce((page1, page2) => page1.concat(page2)))
  }

  if (remainPages && remainPages.length > 0) {
    console.log(`Remain ${remainPages.length}.`)
    results = results.concat(await crawl(remainPages, results))
    console.log(results)
  }
  return results
}

mongoose.Promise = global.Promise
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crawl1', {
  useMongoClient: true
}, (error) => {
  if (error) {
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'))
    process.exit()
  }

  console.time('crawl > ')
  const pages = [`${URL}`]
  for (let i = 1; i <= pageCount; i++) {
    pages.push(`${URL}page=${i}`)
    console.log(`${URL}page=${i}`)
  }
  const results = []
  crawl(pages, results).then((companies) => {
    if (!companies)
      return
    console.log(`Created ${companies.length} companies`)
    return
  }).then(() => {
    console.timeEnd('crawl > ')
    process.exit()
  })


})
