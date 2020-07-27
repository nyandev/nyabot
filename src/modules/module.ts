import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Discord = require( 'discord.js' )

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Parser, ParsedStruct } from '../lib/parser'

export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  registerCommand( name: string, cb: CommandCallbackType ): boolean
}

export interface ModuleInterface
{
  registerStuff( id: number, host: NyaInterface ): boolean
}