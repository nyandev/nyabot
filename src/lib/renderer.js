const Canvas = require( 'canvas' )

Canvas.registerFont( 'geomgraphic_bold.otf', { family: 'geomgraph', weight: 'normal', style: 'normal' })
Canvas.registerFont( 'SFHypocrisy-Medium.otf', { family: 'sfhypo', weight: 'normal', style: 'normal' })

module.exports = class Renderer
{
  constructor( opts )
  {
    this._dim = [opts.width, opts.height]
    this._canvas = Canvas.createCanvas( this._dim[0], this._dim[1] )
    this._ctx = this._canvas.getContext( '2d' )
    this._ctx.patternQuality = 'best'
    this._ctx.quality = 'best'
    this._ctx.antialias = 'gray'
  }
  drawImage( pos, size, image )
  {
    this._ctx.drawImage( image, pos[0], pos[1], size[0], size[1] );
  }
  drawAvatar( pos, size, image, bgColor, outlineWidth, outlineColor )
  {
    let ctx = this._ctx
    let radius = ( size * 0.5 )
    ctx.fillStyle = bgColor
    ctx.beginPath()
    ctx.arc( pos[0] + radius, pos[1] + radius, radius + ( outlineWidth * 0.5 ), 0, Math.PI * 2, true )
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc( pos[0] + radius, pos[1] + radius, radius, 0, Math.PI * 2, false )
    ctx.clip( 'nonzero' )
    ctx.drawImage( image, pos[0], pos[1], size, size )
    ctx.restore()
    if ( outlineWidth > 0 )
    {
      ctx.strokeStyle = outlineColor
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.arc( pos[0] + radius, pos[1] + radius, radius + ( outlineWidth * 0.5 ), 0, Math.PI * 2, true )
      ctx.stroke()
    }
  }
  drawText( pos, font, size, align, textColor, text )
  {
    let ctx = this._ctx
    ctx.font = [size, 'px "', font, '"'].join( '' )
    ctx.fillStyle = textColor
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillText( text, pos[0], pos[1] )
  }
  async toBuffer( mimeType = 'image/png' )
  {
    return new Promise( ( resolve, reject ) =>
    {
      this._canvas.toBuffer( ( err, buf ) =>
      {
        if ( err )
          return reject( err )
        resolve( buf )
      }, mimeType )
    })
  }
}
