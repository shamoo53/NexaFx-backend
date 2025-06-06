import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('WalletService', () => {
    let service: WalletService;
    let repository: Repository<Wallet>;

    const mockWallet = {
        id: '1',
        userId: 'user1',
        stellarAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        metamaskAddress: '0x1234567890123456789012345678901234567890',
        isPrimary: false,
    };

    const mockRepository = {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WalletService,
                {
                    provide: getRepositoryToken(Wallet),
                    useValue: mockRepository,
                },
            ],
        }).compile();

        service = module.get<WalletService>(WalletService);
        repository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a new wallet', async () => {
            const createWalletDto = {
                stellarAddress: mockWallet.stellarAddress,
                metamaskAddress: mockWallet.metamaskAddress,
                isPrimary: false,
            };

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue(mockWallet);
            mockRepository.save.mockResolvedValue(mockWallet);

            const result = await service.create('user1', createWalletDto);

            expect(result).toEqual(mockWallet);
            expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { userId: 'user1' } });
            expect(mockRepository.create).toHaveBeenCalledWith({
                userId: 'user1',
                ...createWalletDto,
            });
            expect(mockRepository.save).toHaveBeenCalledWith(mockWallet);
        });

        it('should throw ConflictException if user already has a wallet', async () => {
            mockRepository.findOne.mockResolvedValue(mockWallet);

            await expect(service.create('user1', {})).rejects.toThrow(ConflictException);
        });
    });

    describe('findAll', () => {
        it('should return all wallets for a user', async () => {
            mockRepository.find.mockResolvedValue([mockWallet]);

            const result = await service.findAll('user1');

            expect(result).toEqual([mockWallet]);
            expect(mockRepository.find).toHaveBeenCalledWith({ where: { userId: 'user1' } });
        });
    });

    describe('findOne', () => {
        it('should return a wallet if found', async () => {
            mockRepository.findOne.mockResolvedValue(mockWallet);

            const result = await service.findOne('1', 'user1');

            expect(result).toEqual(mockWallet);
            expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: '1', userId: 'user1' } });
        });

        it('should throw NotFoundException if wallet not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(service.findOne('1', 'user1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update a wallet', async () => {
            const updateWalletDto = { isPrimary: true };
            const updatedWallet = { ...mockWallet, isPrimary: true };

            mockRepository.findOne.mockResolvedValue(mockWallet);
            mockRepository.save.mockResolvedValue(updatedWallet);

            const result = await service.update('1', 'user1', updateWalletDto);

            expect(result).toEqual(updatedWallet);
            expect(mockRepository.update).toHaveBeenCalledWith(
                { userId: 'user1', isPrimary: true },
                { isPrimary: false }
            );
            expect(mockRepository.save).toHaveBeenCalledWith(updatedWallet);
        });
    });

    describe('remove', () => {
        it('should remove a wallet', async () => {
            mockRepository.findOne.mockResolvedValue(mockWallet);
            mockRepository.remove.mockResolvedValue(mockWallet);

            await service.remove('1', 'user1');

            expect(mockRepository.remove).toHaveBeenCalledWith(mockWallet);
        });
    });

    describe('getUserBalances', () => {
        let service: WalletService;
        let repository: any;
        let horizonService: any;

        beforeEach(() => {
            repository = {
                find: jest.fn(),
            };
            horizonService = {
                getAccountBalances: jest.fn(),
            };
            service = new WalletService(repository, horizonService);
        });

        it('should return an empty array if user has no wallets', async () => {
            repository.find.mockResolvedValue([]);
            const result = await service.getUserBalances('user1');
            expect(result).toEqual([]);
        });

        it('should return balances for a single stellar wallet', async () => {
            const wallet = { id: 'w1', userId: 'user1', stellarAddress: 'GABC', metamaskAddress: null };
            repository.find.mockResolvedValue([wallet]);
            horizonService.getAccountBalances.mockResolvedValue([
                { asset_code: 'USD', balance: '100', locked: '10' },
                { asset_type: 'native', balance: '50' },
            ]);
            const result = await service.getUserBalances('user1');
            expect(result).toEqual([
                { currency: 'USD', balance: '100', locked: '10', type: 'stellar', walletId: 'w1' },
                { currency: 'native', balance: '50', locked: '0', type: 'stellar', walletId: 'w1' },
            ]);
        });

        it('should aggregate balances for multiple wallets', async () => {
            const wallets = [
                { id: 'w1', userId: 'user1', stellarAddress: 'GABC', metamaskAddress: null },
                { id: 'w2', userId: 'user1', stellarAddress: 'GDEF', metamaskAddress: null },
            ];
            repository.find.mockResolvedValue(wallets);
            horizonService.getAccountBalances
                .mockResolvedValueOnce([{ asset_code: 'USD', balance: '100' }])
                .mockResolvedValueOnce([{ asset_code: 'EUR', balance: '200' }]);
            const result = await service.getUserBalances('user1');
            expect(result).toEqual([
                { currency: 'USD', balance: '100', locked: '0', type: 'stellar', walletId: 'w1' },
                { currency: 'EUR', balance: '200', locked: '0', type: 'stellar', walletId: 'w2' },
            ]);
        });

        it('should skip wallets without stellarAddress', async () => {
            const wallets = [
                { id: 'w1', userId: 'user1', stellarAddress: null, metamaskAddress: null },
            ];
            repository.find.mockResolvedValue(wallets);
            const result = await service.getUserBalances('user1');
            expect(result).toEqual([]);
        });
    });
});