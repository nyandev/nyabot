// to debug, pass --inspect --inspect-brk
if ( global.v8debug )
{
  global.v8debug.Debug.setBreakOnException()
  global.v8debug.Debug.setBreakOnUncaughtException()
}

import Graceful from 'node-graceful'
import minimist = require( 'minimist' )
import fs = require( 'fs' )

import bodyParser = require( 'body-parser' )
import express = require( 'express' )
import twitter = require( 'twitter-webhooks' )

import { logSprintf } from './globals'
import { Backend } from './lib/backend'
import { Nya } from './lib/nya'

// Main run function.
// Uses Graceful and some promise trickery to handle Ctrl+C & exit neatly.
async function run( configuration: any )
{
  const backend = new Backend( configuration.backend )
  await backend.initialize()

  const nya = new Nya( configuration.bot, backend )

  const httpApp = express()
  httpApp.use( bodyParser.json() )
  console.log('DOMAIN: ', `https://${configuration.backend.http.domain}`)
  const twitterWebhook = twitter.userActivity( {
    serverUrl: `https://${configuration.backend.http.domain}`,
    route: configuration.backend.http.twitterPath,
    consumerKey: configuration.backend.http.twitterAPIKey,
    consumerSecret: configuration.backend.http.twitterAPIKeySecret,
    accessToken: configuration.backend.http.twitterAccessToken,
    accessTokenSecret: configuration.backend.http.twitterAccessTokenSecret,
    environment: configuration.backend.http.twitterEnvironment,
    app: httpApp
  } )
  twitterWebhook.register()
  httpApp.listen( configuration.backend.http.bind )

  nya.initialize().then( async () =>
  {
    await nya.start()
    logSprintf( 'core', 'Bot started!' )
    let link = await nya.generateInvite()
    logSprintf( 'core', 'Invite link: %s', link )

    Graceful.on( 'exit', async () =>
    {
      nya.stop()

      // Maybe call module.destroy() for each module here or something?
      const speedtypingChannels = await backend._redis.keys( 'speedtyping_*' ) as string[] | null
      if ( speedtypingChannels !== null ) {
        for ( const channel of speedtypingChannels )
          await backend._redis.del( channel )
      }

      await backend.destroy()
      return nya.stoppedPromise
    })
  }).catch( ( error: Error ) =>
  {
    throw error
  })
}

try
{
  // This is the main entrypoint.
  // Load a JSON configuration file and call the runfunc.

  const argv: any = minimist( process.argv.slice( 2 ) )
  const cfgname: string = ( 'c' in argv ) ? argv.c
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