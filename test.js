const fs = require( 'fs' )
const Canvas = require( 'canvas' );
const Renderer = require( './lib/renderer.js' );

async function loadImg( filename )
{
  return new Promise( ( resolve, reject ) =>
  {
    let img = new Canvas.Image;
    img.onload = () => {
      resolve( img );
    };
    img.src = filename;
  });
}

function tryit()
{
  let rnd = new Renderer({ width: 680, height: 420 })
  let imgs = [
    loadImg( 'nya_profile_bg1.png' ),
    loadImg( 'smug_boo-avatar.png' ),
    loadImg( '540297582950481950_icon.png' )
  ]
  Promise.all( imgs ).then( async ( values ) =>
  {
    rnd.drawImage( [0,0], [680,420], values[0] )
    rnd.drawAvatar( [14,10], 86, values[1], 'rgb(0,0,0)', 4, 'rgb(25,128,255)' )
    rnd.drawText( [110,50], 'sfhypo', 28, 'left', 'rgb(255,255,255)', '@SadeN' )
    rnd.drawAvatar( [596,57], 66, values[2], 'rgb(0,0,0)', 4, 'rgb(25,128,255)' )
    rnd.drawText( [586,90], 'sfhypo', 28, 'right', 'rgb(255,255,255)', '@Gamindustri' )
    let buf = await rnd.toBuffer()
    fs.writeFileSync( 'poop_out.png', buf )
  }).catch( fuk => {
console.log(fuk);
  });
}

tryit();
