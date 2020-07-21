// to debug, pass --inspect --inspect-brk
if ( global.v8debug )
{
  global.v8debug.Debug.setBreakOnException();
  global.v8debug.Debug.setBreakOnUncaughtException();
}

const Graceful = require( "node-graceful" );
const minimist = require( "minimist" );
const fs = require( "fs" );

require( "./globals.js" );

try
{
  const argv = minimist( process.argv.slice( 2 ) );
  const cfgname = ( "c" in argv ) ? argv.c
    : ( "config" in argv ) ? argv.config
    : ( "configuration" in argv ) ? argv.configuration
    : null;
  if ( !cfgname )
    throw new Error( "Specify a configuration file to load" );
  const cfgfile = fs.readFileSync( cfgname, "utf8" );
  const configuration = JSON.parse( cfgfile );

  let backend = new Backend( configuration.backend );
  let kon = new Kon( configuration.tg, backend );

  kon.initialize().then( () =>
  {
    kon.start();
    Graceful.on( "exit", () =>
    {
      kon.stop();
      return kon.stoppedPromise;
    }, true );
  }).catch( error =>
  {
    throw error;
  });
}
catch ( error )
{
  logSprintf( "core", "Hard error:" );
  console.log( error );
}
