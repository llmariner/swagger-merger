import { packagePattern } from '../merger.js';

describe('package pattern', () => {
  it('matches simple proto', () => {
    const TEST_PROTO = `syntax = "proto3"
package llm-operator.foobar.v1;

message FooBar {
}

service FooBarService {
    rpc GetFooBar(GetFooBarRequest) returns (GetFooBarResponse) {
        option (google.api.http) = {
            get: "/v1/foobar/foobar/{uuid}"
        };
    }
}
`;

    const matchResult = packagePattern.exec(TEST_PROTO);
    expect(matchResult).not.toBeNull();
    expect(matchResult[1]).toMatch('llm-operator.foobar.');
    expect(matchResult[2]).toMatch('v1');
  });

  it('matches wrapped package', () => {
    const WRAPPED_PACKAGE_PROTO = `syntax = "proto3"
package
  llm-operator.foobar.v1;
`;

    const matchResult = packagePattern.exec(WRAPPED_PACKAGE_PROTO);
    expect(matchResult).not.toBeNull();
    expect(matchResult[1]).toMatch('llm-operator.foobar.');
    expect(matchResult[2]).toMatch('v1');
  });
});
