import { Sequelize, Model, DataTypes, Optional } from 'sequelize'

interface ChannelSettingAttributes {
  channelID: number
  key: string
  value: string | null
  lastChanged: Date | null
}

export class ChannelSetting extends Model<ChannelSettingAttributes> implements ChannelSettingAttributes
{
  public channelID!: number
  public key!: string
  public value!: string | null
  public lastChanged!: Date | null
}

export function initialize( sequelize: Sequelize ): void
{
  ChannelSetting.init(
    {
      channelID: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        references: { model: 'channel', key: 'id' }
      },
      key: {
        type: DataTypes.STRING,
        primaryKey: true
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
      tableName: 'channelsetting',
      timestamps: false
    }
  )
}
