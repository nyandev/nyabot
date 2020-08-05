import { DataTypes, Model, Sequelize } from 'sequelize'

import { debug } from '../globals'


class Club extends Model {}

export function clubInit( sequelize: Sequelize )
{
  Club.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    icon: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: true
    },
    totalExperience: {
      type: DataTypes.VIRTUAL,
      get() {
        return 0
      }
    }
  },
  {
    sequelize,
    modelName: 'club',
    timestamps: false
  })

  return Club
}