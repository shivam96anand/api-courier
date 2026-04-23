import { describe, expect, it } from 'vitest';
import { isWsdlDocument, mapWsdlDocument } from '../wsdl';

const SAMPLE_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/users"
  targetNamespace="http://example.com/users"
  name="UsersService">
  <wsdl:portType name="UsersPort">
    <wsdl:operation name="GetUser"/>
    <wsdl:operation name="CreateUser"/>
  </wsdl:portType>
  <wsdl:binding name="UsersBinding" type="tns:UsersPort">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="GetUser">
      <soap:operation soapAction="http://example.com/users/GetUser"/>
    </wsdl:operation>
    <wsdl:operation name="CreateUser">
      <soap:operation soapAction=""/>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="UsersService">
    <wsdl:port name="UsersPort" binding="tns:UsersBinding">
      <soap:address location="https://api.example.com/soap/users"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;

describe('wsdl importer', () => {
  describe('isWsdlDocument', () => {
    it('detects WSDL 1.1', () => {
      expect(isWsdlDocument(SAMPLE_WSDL)).toBe(true);
    });
    it('rejects plain XML', () => {
      expect(isWsdlDocument('<root/>')).toBe(false);
    });
    it('rejects JSON', () => {
      expect(isWsdlDocument('{"a":1}')).toBe(false);
    });
  });

  it('maps operations into POST SOAP requests', () => {
    const { rootFolder, environments } = mapWsdlDocument(SAMPLE_WSDL);
    expect(rootFolder.name).toBe('UsersService');
    expect(rootFolder.children).toHaveLength(2);

    const getUser = rootFolder.children![0].request!;
    expect(getUser.name).toBe('GetUser');
    expect(getUser.method).toBe('POST');
    expect(getUser.url).toBe('https://api.example.com/soap/users');
    expect(
      (getUser.headers as Record<string, string>)['Content-Type']
    ).toContain('text/xml');
    expect((getUser.headers as Record<string, string>).SOAPAction).toBe(
      '"http://example.com/users/GetUser"'
    );
    expect(getUser.body!.type).toBe('raw');
    expect(getUser.body!.content).toContain(
      'xmlns:tns="http://example.com/users"'
    );
    expect(getUser.body!.content).toContain('<tns:GetUser>');
    expect(getUser.soap?.version).toBe('1.1');

    expect(environments).toHaveLength(1);
    expect(environments[0].variables.wsdlBaseUrl).toBe(
      'https://api.example.com/soap/users'
    );
  });
});
