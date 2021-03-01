import { Sequelize } from 'sequelize'

import * as ChannelModel from './channel'
import * as ChanneSettingModel from './channelsetting'
import * as ClubModel from './club'
import * as ClubUserModel from './clubuser'
import * as GuildModel from './guild'
import * as GuildSettingModel from './guildsetting'
import * as GuildUserModel from './guilduser'
import * as UserModel from './user'

export function initialize( sequelize: Sequelize )
{
  ChannelModel.initialize( sequelize )
  ChanneSettingModel.initialize( sequelize )
  ClubModel.initialize( sequelize )
  ClubUserModel.initialize( sequelize )
  GuildModel.initialize( sequelize )
  GuildSettingModel.initialize( sequelize )
  GuildUserModel.initialize( sequelize )
  UserModel.initialize( sequelize )

  ClubModel.Club.hasMany( ClubUserModel.ClubUser, { foreignKey: 'clubID' } )
  ClubUserModel.ClubUser.belongsTo( ClubModel.Club, { foreignKey: 'clubID' } )
}

// Add re-exports for the others as needed I guess
export { Channel as ChannelModel } from './channel'
export { Guild as GuildModel } from './guild'
