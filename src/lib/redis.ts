import * as IORedis from 'ioredis'

export class Redis
{
  _ioredis: IORedis.Redis

  constructor( config: any )
  {
    this._ioredis = new IORedis( config )
  }

  incrementFloat( key: string, value: any ): Promise<number>
  {
    return this._ioredis.incrbyfloat( key, value )
  }

  del( key: string ): Promise<number>
  {
    return this._ioredis.del( key )
  }

  get( key: string ): Promise<string | null>
  {
    return this._ioredis.get( key )
  }

  set( key: string, value: any ): Promise<'OK' | null>
  {
    return this._ioredis.set( key, value )
  }

  async keys( query?: string ): Promise<Set<string>>
  {
    if ( !query )
      query = '*'
    const keys = new Set<string>()
    let cursor = '0'
    do {
      const response = await this._ioredis.scan( cursor, 'MATCH', query )
      cursor = response[0]
      for ( const key of response[1] )
        keys.add( key )
    } while ( cursor !== '0' )
    return keys
  }
}