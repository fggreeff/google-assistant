var env = process.env.NODE_ENV || 'development'

if (env === 'development') {
  var config = require('./config.json')
  var serviceAccountConfig = config[env]
}
module.exports = { serviceAccountConfig }
