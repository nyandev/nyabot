'use strict'

const sprintf = require( 'sprintf-js' ).sprintf
const moment = require( 'moment' )

module.exports = ( sequelize, DataTypes ) =>
{
  return sequelize.define( 'user',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    snowflake: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    discriminator: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    bot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    level: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    lastLeveled: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    experience: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    totalExperience: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    }
  }, { timestamps: false })
}