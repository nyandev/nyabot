'use strict'

// to debug, pass --inspect --inspect-brk
if ( global.v8debug )
{
  global.v8debug.Debug.setBreakOnException()
  global.v8debug.Debug.setBreakOnUncaughtException()
}

const Graceful = require( 'node-graceful' )
const minimist = require( 'minimist' )
const fs = require( 'fs' )

require( './globals.js' )
const Backend = require( './lib/backend.js' )
const Nya = require( './lib/nya.js' )

async function run( configuration )
{
  let backend = new Backend( configuration.backend )
  await backend.initialize()

  let nya = new Nya( configuration.bot, backend )

  nya.initialize().then( async () =>
  {
    await nya.start()
    logSprintf( 'core', 'Bot started!' )
    let link = await nya.generateInvite()
    logSprintf( 'core', 'Invite link: %s', link )
    Graceful.on( 'exit', async () =>
    {
      nya.stop()
      await backend.destroy()
      return bot.stoppedPromise
    }, true )
  }).catch( error =>
  {
    throw error
  })
}

try
{
  const argv = minimist( process.argv.slice( 2 ) )
  const cfgname = ( 'c' in argv ) ? argv.c
    : ( 'config' in argv ) ? argv.config
    : ( 'configuration' in argv ) ? argv.configuration
    : null

  if ( !cfgname )
    throw new Error( 'Specify a configuration file to load' )

  const cfgfile = fs.readFileSync( cfgname, 'utf8' )
  const configuration = JSON.parse( cfgfile )

  run( configuration )
}
catch ( error )
{
  logSprintf( 'core', 'Hard error:' )
  console.log( error )
}