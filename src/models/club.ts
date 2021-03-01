import {
  Sequelize, Model, ModelDefined, DataTypes,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyHasAssociationMixin,
  Association,
  HasManyCountAssociationsMixin,
  HasManyCreateAssociationMixin,
  Optional } from 'sequelize'

interface ClubAttributes {
  id: number
  name: string
  icon: string | null
  owner: number
  created: Date
  updated: Date | null
  totalExperience: number
}

interface ClubCreationAttributes extends Optional<ClubAttributes, 'id'> {}

export class Club extends Model<ClubAttributes, ClubCreationAttributes> implements ClubAttributes
{
  public id!: number
  public name!: string
  public icon!: string | null
  public owner!: number
  public created!: Date
  public updated!: Date | null
  public totalExperience!: number
}

export function initialize( sequelize: Sequelize ): void
{
  Club.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      icon: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      owner: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'user', key: 'id' }
      },
      created: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updated: {
        type: DataTypes.DATE,
        allowNull: true
      },
      totalExperience: {
        type: DataTypes.VIRTUAL,
        get() {
          return 0
        }
      }
    },
    {
      sequelize: sequelize,
      tableName: 'club',
      timestamps: false
    }
  )
}
