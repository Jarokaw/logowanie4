import { ReturnAddressDto } from "./address.dto";
import { Address } from "./address.model";


export class AddressMapper {
    static fromDocToDto(doc: Address): ReturnAddressDto {
        if (!doc) {
            return null;
        }

        const returnAddress: ReturnAddressDto = {
            id: doc.id,
            city: doc.city,
            street: doc.street,
            buildingNumber: doc.buildingNumber,
            apartmentNumber: doc.apartmentNumber,
            idUser: doc.idUser
        };
        return returnAddress;
    }

    static fromDocToList(docs: Address[]): ReturnAddressDto[] {
        if (!docs || (docs.length && docs.every(d => !d.id))) {
            return null;
        }
        return docs.map((doc: Address) => AddressMapper.fromDocToDto(doc));
    }
}