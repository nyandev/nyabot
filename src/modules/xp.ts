import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Discord = require( 'discord.js' )

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { CommandCallbackType, NyaInterface, ModuleInterface } from '../modules/module'

export class XPModule implements ModuleInterface
{
  protected _id: number
  registerStuff( id: number, host: NyaInterface ): boolean
  {
    this._id = id
    host.registerCommand( 'poop', (): boolean => {
      return false
    })
    return true
  }
}