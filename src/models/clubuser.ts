import { Sequelize, Model, DataTypes, Optional } from 'sequelize'

interface ClubUserAttributes {
  id: number
  userID: number
  joined: Date
  experience: number
}

interface ClubUserCreationAttributes extends Optional<ClubUserAttributes, 'id'> {}

export class ClubUser extends Model<ClubUserAttributes, ClubUserCreationAttributes> implements ClubUserAttributes
{
  public id!: number
  public userID!: number
  public joined!: Date
  public experience!: number
}

export function initialize( sequelize: Sequelize ): void
{
  ClubUser.init(
    {
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
      sequelize: sequelize,
      tableName: 'clubuser',
      timestamps: false
    }
  )
}
