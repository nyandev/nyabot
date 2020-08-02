'use strict'

module.exports = ( sequelize, DataTypes ) =>
{
  return sequelize.define( 'guild',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    snowflake: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    icon: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    available: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    joined: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, { timestamps: false })
}