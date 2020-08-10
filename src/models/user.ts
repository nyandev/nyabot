import { DataTypes, Sequelize } from 'sequelize'


export function init( sequelize: Sequelize )
{
  return sequelize.define( 'user',
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
    },
    currency: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, { timestamps: false })
}