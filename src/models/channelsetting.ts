import { DataTypes, Sequelize } from 'sequelize'


export function init( sequelize: Sequelize )
{
  return sequelize.define( 'channelsetting',
  {
    channelID: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      references: { model: 'channel', key: 'id' }
    },
    key: {
      type: DataTypes.STRING,
      primaryKey: true
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
