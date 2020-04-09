const mongoose = require('mongoose')
const Schema = mongoose.Schema

const companySchema = new Schema({
  name: String,
  link: String,
  category: String,
  content: String,
}, {
  timestamps: true
})

const Company = mongoose.model('Company', companySchema)

module.exports = Company
