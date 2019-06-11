'use strict'

const assertPromise = require('../../../test/plugins/promise')

assertPromise('q', Q => {
  return function Promise (executor) {
    const deferred = Q.defer()

    executor(deferred.resolve, deferred.reject)

    return deferred.promise
  }
})
