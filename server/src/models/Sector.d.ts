import mongoose, { Document } from 'mongoose';
import { Sector as ISector } from '../types';
export interface SectorDocument extends Omit<ISector, '_id'>, Document {
}
export declare const Sector: mongoose.Model<SectorDocument, {}, {}, {}, mongoose.Document<unknown, {}, SectorDocument, {}, {}> & SectorDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
