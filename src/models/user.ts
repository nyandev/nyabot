import {
  Sequelize, Model, ModelDefined, DataTypes,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyHasAssociationMixin,
  Association,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  Optional } from 'sequelize'

interface UserAttributes {
  id: number
  snowflake: string
  name: string | null
  discriminator: string | null
  avatar: string | null
  bot: boolean
  created: Date | string | null
  updated: Date | string | null
  level: number
  lastLeveled: Date | string | null
  experience: number
  totalExperience: number
  access: string
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'name' | 'discriminator' | 'avatar' | 'bot' | 'created' | 'updated' | 'level' | 'lastLeveled' | 'experience' | 'totalExperience' | 'access'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes
{
  public id!: number
  public snowflake!: string
  public name!: string | null
  public discriminator!: string | null
  public avatar!: string | null
  public bot: boolean
  public created!: Date | string | null
  public updated!: Date | string | null
  public level: number
  public lastLeveled!: Date | string | null
  public experience: number
  public totalExperience: number
  public access: string
}

export function initialize( sequelize: Sequelize ): void
{
  User.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      snowflake: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      discriminator: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      },
      avatar: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      bot: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      updated: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
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
      },
      access: {
        type: DataTypes.ENUM( 'owner', 'admin', 'user' ),
        allowNull: false,
        defaultValue: 'user'
      }
    },
    {
      sequelize: sequelize,
      tableName: 'user',
      timestamps: false
    }
  )
}
