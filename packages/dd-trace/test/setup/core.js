'use strict'

const sinon = require('sinon')
const chai = require('chai')
const sinonChai = require('sinon-chai')
const proxyquire = require('../proxyquire')
const nock = require('nock')
const semver = require('semver')
const platform = require('../../src/platform')
const node = require('../../src/platform/node')
const AsyncHooksScope = require('../../src/scope/async_hooks')
const AsyncListenerScope = require('../../src/scope/async-listener')
const agent = require('../plugins/agent')
const externals = require('../plugins/externals.json')

const asyncHooksScope = new AsyncHooksScope()
const asyncListenerScope = new AsyncListenerScope()

chai.use(sinonChai)

global.sinon = sinon
global.expect = chai.expect
global.proxyquire = proxyquire
global.nock = nock
global.wrapIt = wrapIt
global.withVersions = withVersions

platform.use(node)

afterEach(() => {
  agent.reset()
  platform.metrics().stop()
})

function wrapIt () {
  const it = global.it

  global.it = function (title, fn) {
    if (!fn) return it.apply(this, arguments)

    const length = fn.length

    fn = asyncHooksScope.bind(fn, null)
    fn = asyncListenerScope.bind(fn, null)

    if (length > 0) {
      return it.call(this, title, function (done) {
        done = asyncHooksScope.bind(done, null)
        done = asyncListenerScope.bind(done, null)

        return fn.call(this, done)
      })
    } else {
      return it.call(this, title, fn)
    }
  }
}

function withVersions (plugin, modules, range, cb) {
  const instrumentations = [].concat(plugin)
  const names = [].concat(plugin).map(instrumentation => instrumentation.name)

  modules = [].concat(modules)

  names.forEach(name => {
    if (externals[name]) {
      [].concat(externals[name]).forEach(external => {
        instrumentations.push(external)
      })
    }
  })

  if (!cb) {
    cb = range
    range = null
  }

  modules.forEach(moduleName => {
    const testVersions = new Map()

    instrumentations
      .filter(instrumentation => instrumentation.name === moduleName)
      .forEach(instrumentation => {
        instrumentation.versions
          .forEach(version => {
            try {
              const min = semver.coerce(version).version
              require(`../../../../versions/${moduleName}@${min}`).get()
              testVersions.set(min, { range: version, test: min })
            } catch (e) {
              // skip unsupported version
            }

            agent.wipe()

            try {
              const max = require(`../../../../versions/${moduleName}@${version}`).version()
              require(`../../../../versions/${moduleName}@${version}`).get()
              testVersions.set(max, { range: version, test: version })
            } catch (e) {
              // skip unsupported version
            }

            agent.wipe()
          })
      })

    Array.from(testVersions)
      .filter(v => !range || semver.satisfies(v[0], range))
      .sort(v => v[0].localeCompare(v[0]))
      .map(v => Object.assign({}, v[1], { version: v[0] }))
      .forEach(v => {
        describe(`with ${moduleName} ${v.range} (${v.version})`, () => cb(v.test, moduleName))
      })

    agent.wipe()
  })
}
