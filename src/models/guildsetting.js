'use strict'

const sprintf = require( 'sprintf-js' ).sprintf
const moment = require( 'moment' )

module.exports = ( sequelize, DataTypes ) =>
{
  return sequelize.define( 'guildsetting',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    guildID: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
      references: { model: 'guild', key: 'id' }
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    lastChanged: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, { timestamps: false })
}