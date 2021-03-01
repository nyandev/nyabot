import {
  Sequelize, Model, ModelDefined, DataTypes,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyHasAssociationMixin,
  Association,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  Optional } from 'sequelize'

interface ChannelAttributes {
  id: number
  snowflake: string
  guildID: number
  name: string | null
  type: string
  deleted: boolean
  nsfw: boolean
  topic: string
  updated: Date | string | null
}

interface ChannelCreationAttributes extends Optional<ChannelAttributes, 'id'> {}

export class Channel extends Model<ChannelAttributes, ChannelCreationAttributes> implements ChannelAttributes
{
  public id!: number
  public snowflake!: string
  public guildID!: number
  public name!: string | null
  public type!: string
  public deleted!: boolean
  public nsfw!: boolean
  public topic!: string
  public updated!: Date | string | null
}

export function initialize( sequelize: Sequelize ): void
{
  Channel.init(
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
      guildID: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'guild', key: 'id' }
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      type: {
        type: DataTypes.ENUM('dm', 'text', 'voice', 'category', 'news', 'store', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },
      deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      nsfw: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      topic: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
      },
      updated: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      sequelize: sequelize,
      tableName: 'channel',
      timestamps: false
    }
  )
}
