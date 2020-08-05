'use strict'

module.exports = ( sequelize, DataTypes ) =>
{
  return sequelize.define( 'channel',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    snowflake: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    guildID: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'guild', key: 'id' }
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    type: {
      type: DataTypes.ENUM('dm', 'text', 'voice', 'category', 'news', 'store', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown'
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    nsfw: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    topic: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, { timestamps: false })
}