import { DataTypes, Sequelize } from 'sequelize'


export function init( sequelize: Sequelize )
{
  return sequelize.define( 'guilduser',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    guildID: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'guild', key: 'id' }
    },
    userID: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'user', key: 'id' }
    },
    nickname: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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