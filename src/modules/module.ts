import { logSprintf } from '../globals'
import fs = require( 'fs' )
import { EventEmitter } from 'events'
import Commando = require( 'discord.js-commando' )

import * as moment from 'moment'
import sprintfjs = require( 'sprintf-js' )
const sprintf = sprintfjs.sprintf

import { Parser, ParsedStruct } from '../lib/parser'
import { Backend } from '../lib/backend'

export interface CommandCallbackType { (): boolean }

export interface NyaInterface
{
  getBackend(): Backend
  registerCommand( name: string, cb: CommandCallbackType ): boolean
}

export interface ModuleInterface
{
  getBackend(): Backend
  getCommands( host: NyaInterface, client: Commando.CommandoClient ): Commando.Command[]
  registerStuff( id: number, host: NyaInterface ): boolean
}