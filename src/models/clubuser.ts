import { DataTypes, Model, Sequelize } from 'sequelize'


class ClubUser extends Model {}

export function clubUserInit( sequelize: Sequelize )
{
  ClubUser.init({
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
  },
  {
    sequelize,
    modelName: 'ClubUser',
    timestamps: false
  })
  return ClubUser
}