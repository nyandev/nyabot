import { Sequelize, Model, DataTypes, Optional } from 'sequelize'

interface GuildSettingAttributes {
  id: number
  guildID: number | null
  key: string
  value: string | null
  lastChanged: Date | null
}

interface GuildSettingCreationAttributes extends Optional<GuildSetting, 'id'> {}

export class GuildSetting extends Model<GuildSettingAttributes, GuildSettingCreationAttributes> implements GuildSettingAttributes
{
  public id!: number
  public guildID!: number | null
  public key!: string
  public value!: string | null
  public lastChanged!: Date | null
}

export function initialize( sequelize: Sequelize ): void
{
  GuildSetting.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      guildID: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        references: { model: 'guild', key: 'id' }
      },
      key: {
        type: DataTypes.STRING,
        allowNull: false
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      lastChanged: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      sequelize: sequelize,
      tableName: 'guildsetting',
      timestamps: false
    }
  )
}
