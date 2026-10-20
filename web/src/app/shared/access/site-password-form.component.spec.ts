import { TestBed } from '@angular/core/testing';
import { SiteAccessService } from '@core/access/site-access.service';
import { SitePasswordFormComponent } from './site-password-form.component';

describe('SitePasswordFormComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  async function create() {
    await TestBed.configureTestingModule({
      imports: [SitePasswordFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SitePasswordFormComponent);
    await fixture.whenStable();
    return { fixture, form: fixture.componentInstance, access: TestBed.inject(SiteAccessService) };
  }

  it('reports success and clears the field', async () => {
    const { form, access } = await create();
    const unlock = vi.spyOn(access, 'unlock').mockResolvedValue({ ok: true });
    const unlocked = vi.fn();
    form.unlocked.subscribe(unlocked);
    await form.submit();
    expect(unlock).not.toHaveBeenCalled();
    form.password.set('secret password');
    await form.submit();
    expect(unlock).toHaveBeenCalledWith('secret password');
    expect(unlocked).toHaveBeenCalledTimes(1);
    expect(form.password()).toBe('');
    expect(form.busy()).toBe(false);
  });

  it('shows why the password was refused', async () => {
    const { fixture, form, access } = await create();
    vi.spyOn(access, 'unlock').mockResolvedValue({
      ok: false,
      message: 'That password is not right.',
    });
    form.password.set('nope');
    await form.submit();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'That password is not right.',
    );
    expect(element.querySelector('input')?.getAttribute('type')).toBe('password');
  });

  it('checks another password when given one, such as the admin password', async () => {
    const { fixture, form, access } = await create();
    const unlock = vi.spyOn(access, 'unlock');
    const check = vi.fn().mockResolvedValue({ ok: true });
    fixture.componentRef.setInput('check', check);
    fixture.componentRef.setInput('inputId', 'admin-password');
    fixture.componentRef.setInput('prompt', 'Admin password');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('label')?.getAttribute('for')).toBe('admin-password');
    expect(element.querySelector('input')?.id).toBe('admin-password');
    form.password.set('admin secret');
    await form.submit();
    expect(check).toHaveBeenCalledWith('admin secret');
    expect(unlock).not.toHaveBeenCalled();
  });
});
