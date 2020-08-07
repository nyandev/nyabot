import { DataTypes, Model, Sequelize } from 'sequelize'


export function init( sequelize: Sequelize )
{
  return sequelize.define( 'club', {
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
    owner: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'user', key: 'id' }
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
    timestamps: false
  })
}