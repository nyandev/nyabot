import { Sequelize, Model, DataTypes, Optional } from 'sequelize'

interface ClubUserAttributes {
  id: number
  userID: number
  joined: Date | string
  experience: number
  clubID: number
}

interface ClubUserCreationAttributes extends Optional<ClubUserAttributes, 'id' | 'experience'> {}

export class ClubUser extends Model<ClubUserAttributes, ClubUserCreationAttributes> implements ClubUserAttributes
{
  public id!: number
  public userID!: number
  public joined!: Date | string
  public experience!: number
  public clubID!: number
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
      },
      clubID: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'club', key: 'id' }
      }
    },
    {
      sequelize: sequelize,
      tableName: 'clubuser',
      timestamps: false
    }
  )
}
