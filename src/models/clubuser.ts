import { DataTypes, Sequelize } from 'sequelize'


export function init( sequelize: Sequelize )
{
  return sequelize.define( 'clubuser', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    userID: {
      type: DataTypes.INTEGER.UNSIGNED,
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
  },
  {
    timestamps: false
  })
}