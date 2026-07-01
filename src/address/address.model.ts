import { UUID } from "crypto";
import {  AllowNull, BelongsTo, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";
import { User } from "src/users/models/users.model";

@Table({tableName: 'address'})
export class Address extends Model<Address> {
    @Column({
        type:DataType.UUID,
        allowNull:false,
        unique: true,
        primaryKey: true,
        defaultValue: DataType.UUIDV4
    })
    declare id: string;
    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare city: string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare street: string;

    @Column({
        type:DataType.STRING,
        allowNull: false
    })
    declare buildingNumber: string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare apartmentNumber: string;

    declare idUser: string;
    @BelongsTo(() => User, 'idUser')
    declare user: User;

}