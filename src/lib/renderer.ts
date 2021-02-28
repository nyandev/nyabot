import * as fs from 'fs'
import { Buffer } from 'buffer'
import { Canvas, Image, CanvasRenderingContext2D, NodeCanvasRenderingContext2DSettings, PngConfig, JpegConfig, CanvasGradient, CanvasPattern, createCanvas, createImageData, loadImage, registerFont } from 'canvas'

// Canvas.registerFont( 'geomgraphic_bold.otf', { family: 'geomgraph', weight: 'normal', style: 'normal' })
// Canvas.registerFont( 'SFHypocrisy-Medium.otf', { family: 'sfhypo', weight: 'normal', style: 'normal' })

export function globalRegisterFont( filepath: string, name: string )
{
  if ( !fs.existsSync( filepath ) )
    throw new Error( 'Font file does not exist' )
  registerFont( filepath, { family: name, weight: 'normal', style: 'normal' } )
}

export class Point
{
  public x: number
  public y: number
  constructor( x?: number, y?: number )
  {
    this.x = x || 0
    this.y = y || 0
  }
  from( ...args: Array<any> )
  {
    if ( !args.length )
      throw new Error( "No arguments" )
    if ( Array.isArray( args[0] ) && args[0].length == 2 )
    {
      this.x = args[0][0]
      this.y = args[0][1]
    }
    else if ( args[0] instanceof Point )
    {
      this.x = args[0].x
      this.y = args[0].y
    }
    else if ( args.length === 2 && typeof args[0] === 'number' && typeof args[1] === 'number' )
    {
      this.x = args[0]
      this.y = args[1]
    }
    else
      throw new Error( "Invalid arguments" )
  }
}

type PointLike = Point | []

export class Dimensions
{
  public width: number
  public height: number
  constructor( width?: number, height?: number )
  {
    this.width = width || 0
    this.height = height || 0
  }
  from( ...args: Array<any> )
  {
    if ( !args.length )
      throw new Error( "No arguments" )
    if ( Array.isArray( args[0] ) && args[0].length == 2 )
    {
      this.width = args[0][0]
      this.height = args[0][1]
    }
    else if ( args[0] instanceof Dimensions )
    {
      this.width = args[0].width
      this.height = args[0].height
    }
    else if ( args.length === 2 && typeof args[0] === 'number' && typeof args[1] === 'number' )
    {
      this.width = args[0]
      this.height = args[1]
    }
    else
      throw new Error( "Invalid arguments" )
  }
}

type DimensionsLike = Dimensions | []

type ImageLike = Image | Canvas

type FillLike = string | CanvasGradient | CanvasPattern

function toPoint( ...args: Array<any> ): Point
{
  let ret = new Point
  ret.from( ...args )
  return ret
}

function toDimensions( ...args: Array<any> ): Dimensions
{
  let ret = new Dimensions
  ret.from( ...args )
  return ret
}

export class Renderer
{
  protected readonly _dimensions: Dimensions
  protected _canvas: Canvas
  protected _context: CanvasRenderingContext2D

  private recreate(): void
  {
    this._canvas = createCanvas( this._dimensions.width, this._dimensions.height )

    const opts: NodeCanvasRenderingContext2DSettings = {
      alpha: false,
      pixelFormat: 'RGBA32'
    }

    this._context = this._canvas.getContext( '2d', opts )

    this._context.patternQuality = 'best'
    this._context.quality = 'best'
    this._context.antialias = 'gray'
  }

  constructor( dimensions: DimensionsLike )
  {
    this._dimensions.from( dimensions )
    this.recreate()
  }

/*
  static drawFlowers( image: Image, code: string )
  {
    const renderer = new this( image )
    renderer.drawImage( [0, 0], image, image )

    const ctx = renderer._context
    const textSize = Math.round(.15 * image.height)
    ctx.font = `${textSize}px SourceSansPro-Semibold`
    const textDims = ctx.measureText(code)
    const textHeight = textDims.actualBoundingBoxAscent + textDims.actualBoundingBoxDescent
    const boxWidth = Math.round(1.2 * textDims.width)
    const boxHeight = Math.round(1.4 * textHeight)
    const paddingWidth = (boxWidth - textDims.width) / 2
    const paddingHeight = (boxHeight - textHeight) / 2

    ctx.fillStyle = 'rgba(0, 0, 0, .5)'
    ctx.fillRect(0, 0, boxWidth, boxHeight)
    ctx.fillStyle = 'white'
    ctx.fillText(code, paddingWidth, boxHeight - textDims.actualBoundingBoxDescent - paddingHeight)
    return renderer
  }
*/

  drawImage( position: PointLike, size: DimensionsLike, image: ImageLike ): void
  {
    const cpos = toPoint( position )
    const cdim = toDimensions( size )
    this._context.drawImage( image, cpos.x, cpos.y, cdim.width, cdim.height )
  }

  drawAvatar( position: PointLike, size: number, image: ImageLike, backgroundFill: FillLike, outlineWidth: number, outlineFill: FillLike ): void
  {
    const cpos = toPoint( position )
    const radius = ( size * 0.5 )

    const ctx = this._context
    ctx.fillStyle = backgroundFill
    ctx.beginPath()
    ctx.arc( cpos.x + radius, cpos.y + radius, radius + ( outlineWidth * 0.5 ), 0, Math.PI * 2, true )
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc( cpos.x + radius, cpos.y + radius, radius, 0, Math.PI * 2, false )
    ctx.clip( 'nonzero' )
    ctx.drawImage( image, cpos.x, cpos.y, size, size )
    ctx.restore()

    if ( outlineWidth > 0 )
    {
      ctx.strokeStyle = outlineFill
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.arc( cpos.x + radius, cpos.y + radius, radius + ( outlineWidth * 0.5 ), 0, Math.PI * 2, true )
      ctx.stroke()
    }
  }

  drawText( position: PointLike, font: string, size: number, align: any, textFill: FillLike, text: string ): void
  {
    const cpos = toPoint( position )

    const ctx = this._context
    ctx.font = [size, 'px "', font, '"'].join( '' )
    ctx.fillStyle = textFill
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillText( text, cpos.x, cpos.y )
  }

  async toPNGBuffer(): Promise<Buffer>
  {
    const opts: PngConfig = {
      compressionLevel: 8
    }
    return new Promise( ( resolve, reject ) =>
    {
      this._canvas.toBuffer( ( error: Error | null, buffer: Buffer ) =>
      {
        if ( error )
          return reject( error )
        resolve( buffer )
      }, 'image/png', opts )
    })
  }
}
