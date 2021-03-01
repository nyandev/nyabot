import { Sequelize, Model, ModelDefined, DataTypes, Optional } from 'sequelize'

interface GuildUserAttributes {
  id: number
  guildID: number
  userID: number
  nickname: string | null
  deleted: boolean
  currency: number
  level: number
  lastLeveled: Date | string | null
  experience: number
  totalExperience: number
}

interface GuildUserCreationAttributes extends Optional<GuildUserAttributes, 'id' | 'nickname' | 'deleted' | 'currency' | 'level' | 'lastLeveled' | 'experience' | 'totalExperience'> {}

export class GuildUser extends Model<GuildUserAttributes, GuildUserCreationAttributes> implements GuildUserAttributes
{
  public id!: number
  public guildID!: number
  public userID!: number
  public nickname!: string | null
  public deleted!: boolean
  public currency!: number
  public level!: number
  public lastLeveled!: Date | string | null
  public experience!: number
  public totalExperience!: number
}

export function initialize( sequelize: Sequelize ): void
{
  GuildUser.init(
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
      currency: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
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
    },
    {
      sequelize: sequelize,
      tableName: 'guilduser',
      timestamps: false
    }
  )
}
