using Microsoft.EntityFrameworkCore.Storage;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.UnitOfWork
{
    public class UnitOfWork : IUnitOfWork
    {
        private readonly MktbaDbContext _context;
        private IDbContextTransaction? _transaction;

        public UnitOfWork(MktbaDbContext context)
        {
            _context = context;
        }

        public async Task BeginTransactionAsync()
        {
            if (_transaction != null) return;
            _transaction = await _context.Database.BeginTransactionAsync();
        }

        public async Task CommitAsync()
        {
            if (_transaction == null) return;
            await _context.SaveChangesAsync();
            await _transaction.CommitAsync();
            await _transaction.DisposeAsync();
            _transaction = null;
        }

        public async Task RollbackAsync()
        {
            if (_transaction == null) return;
            await _transaction.RollbackAsync();
            await _transaction.DisposeAsync();
            _transaction = null;
        }

        public Task<int> SaveChangesAsync()
            => _context.SaveChangesAsync();

        public void Dispose()
        {
            _transaction?.Dispose();
        }
    }
}
