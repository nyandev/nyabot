'use strict'

module.exports = ( sequelize, DataTypes ) =>
{
  return sequelize.define( 'clubuser',
  {
    clubID: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      allowNull: false,
      references: { model: 'club', key: 'id' }
    },
    userID: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      allowNull: false,
      references: { model: 'user', key: 'id' }
    },
    joined: {
      type: DataTypes.DATE,
      allowNull: false
    },
    experience: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    }
  }, { timestamps: false })
}