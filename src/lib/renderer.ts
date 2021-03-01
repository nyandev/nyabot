import * as fs from 'fs'
import { Buffer } from 'buffer'
import { Canvas, Image, CanvasRenderingContext2D, NodeCanvasRenderingContext2DSettings, PngConfig, JpegConfig, CanvasGradient, CanvasPattern, createCanvas, createImageData, loadImage, registerFont } from 'canvas'
import { type } from 'os'
import { sprintf } from 'sprintf-js'

export class Point
{
  public x: number
  public y: number
  public constructor( x: number, y: number )
  public constructor( coordinates: PointLike )
  public constructor( ...args: any[] )
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

type PointLike = Point | number[]

export class Dimensions
{
  public width: number
  public height: number
  public constructor( width: number, height: number )
  public constructor( dimensions: DimensionsLike )
  public constructor( ...args: any[] )
  {
    if ( !args.length )
      throw new Error( "No arguments" )
    if ( Array.isArray( args[0] ) && args[0].length == 2 )
    {
      this.width = args[0][0]
      this.height = args[0][1]
    }
    else if ( typeof args[0].width === 'number' && typeof args[0].height === 'number' )
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

type DimensionsLike = { width: number, height: number } | [number, number]

type ImageLike = Image | Canvas | string

type FillLike = string | CanvasGradient | CanvasPattern

let g_canvasesCreated: boolean = false

export class Renderer
{
  protected readonly _dimensions: Dimensions
  protected _canvas: Canvas
  protected _context: CanvasRenderingContext2D
  protected _images: Map<string, Image> = new Map()

  private recreate(): void
  {
    this._canvas = createCanvas( this._dimensions.width, this._dimensions.height )
    g_canvasesCreated = true

    const opts: NodeCanvasRenderingContext2DSettings = {
      alpha: false,
      pixelFormat: 'RGB24'
    }

    this._context = this._canvas.getContext( '2d', opts )

    this._context.patternQuality = 'best'
    this._context.quality = 'best'
    this._context.antialias = 'gray'
  }

  constructor( dimensions: DimensionsLike )
  {
    this._dimensions = new Dimensions( dimensions )
    this.recreate()
  }

  drawCurrencyDrop( imageName: string, code: string )
  {
    const image = this._resolveImage( imageName )

    this.drawImage( [0, 0], image, image )

    const ctx = this._context
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
  }

  public static registerFont( filepath: string, name: string )
  {
    if ( g_canvasesCreated )
      throw new Error( 'Fonts must be registered before instantiating Renderers' )
    if ( !fs.existsSync( filepath ) )
      throw new Error( 'Font file does not exist' )
    registerFont( filepath, { family: name, weight: 'normal', style: 'normal' } )
  }

  hasImage( name: string ): boolean
  {
    return this._images.has( name )
  }

  async loadImageLocalCached( filepath: string, name: string ): Promise<Image>
  {
    return new Promise( ( resolve, reject ) =>
    {
      if ( !fs.existsSync( filepath ) )
        return reject( new Error( 'Image file does not exist' ) )
      let img = new Image()
      img.onload = () => {
        this._images.set( name, img )
        resolve( img )
      }
      img.onerror = error => { reject( error ) }
      img.src = filepath;
    })
  }

  async loadImage( filepath: string ): Promise<Image>
  {
    return new Promise( ( resolve, reject ) =>
    {
      let img = new Image()
      img.onload = () => { resolve( img ) }
      img.onerror = error => { reject( error ) }
      img.src = filepath;
    })
  }

  private _resolveImage( image: ImageLike ): Image | Canvas
  {
    if ( typeof image === 'string' )
    {
      if ( !this._images.has( image ) )
        throw new Error( "Loaded image not found by name" )
      return ( this._images.get( image ) as Image )
    }
    else
      return image
  }

  drawImage( position: PointLike, size: DimensionsLike, image: ImageLike ): void
  {
    const cpos = ( position instanceof Point ) ? position : new Point( position )
    const cdim = ( size instanceof Dimensions ) ? size : new Dimensions( size )
    this._context.drawImage(
      this._resolveImage( image ),
      cpos.x, cpos.y,
      cdim.width, cdim.height
    )
  }

  drawAvatar( position: PointLike, size: number, image: ImageLike, backgroundFill: FillLike, outlineWidth: number, outlineFill: FillLike ): void
  {
    const cpos = ( position instanceof Point ) ? position : new Point( position )
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
    const cpos = ( position instanceof Point ) ? position : new Point( position )

    const ctx = this._context
    ctx.font = sprintf( '%ipx "%s"', size, font )

    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.shadowBlur = 3
    ctx.shadowColor = 'rgba(0,0,0,0.8)'

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
