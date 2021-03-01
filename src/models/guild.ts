import {
  Sequelize, Model, ModelDefined, DataTypes,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyHasAssociationMixin,
  Association,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  Optional } from 'sequelize'

interface GuildAttributes {
  id: number
  snowflake: string
  name: string
  icon: string | null
  region: string | null
  available: boolean
  joined: Date | null
  updated: Date | null
}

interface GuildCreationAttributes extends Optional<GuildAttributes, 'id'> {}

export class Guild extends Model<GuildAttributes, GuildCreationAttributes> implements GuildAttributes
{
  public id!: number
  public snowflake!: string
  public name!: string
  public icon!: string | null
  public region!: string | null
  public available!: boolean
  public joined!: Date | null
  public updated!: Date | null
}

export function initialize( sequelize: Sequelize ): void
{
  Guild.init(
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
        allowNull: false,
        defaultValue: ''
      },
      icon: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      region: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      },
      available: {
        type: DataTypes.BOOLEAN,
        allowNull: false
      },
      joined: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updated: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      sequelize: sequelize,
      tableName: 'guild',
      timestamps: false
    }
  )
}