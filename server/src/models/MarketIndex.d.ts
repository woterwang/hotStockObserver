import mongoose, { Document } from 'mongoose';
import { MarketIndex as IMarketIndex } from '../types';
export interface MarketIndexDocument extends Omit<IMarketIndex, '_id'>, Document {
}
export declare const MarketIndex: mongoose.Model<MarketIndexDocument, {}, {}, {}, mongoose.Document<unknown, {}, MarketIndexDocument, {}, {}> & MarketIndexDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
